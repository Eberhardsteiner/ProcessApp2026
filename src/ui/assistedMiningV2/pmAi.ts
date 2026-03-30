import type {
  DerivationSummary,
  Process,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
  ProcessVersion,
} from '../../domain/process';
import { computeQualitySummary } from './narrativeParsing';
import { buildAnalysisModeNotice, createObservation, detectProcessMiningAnalysisMode, normalizeWhitespace, uniqueStrings } from './pmShared';

export interface PmAiCanonicalStep {
  label: string;
  role?: string;
  system?: string;
  evidenceSnippet?: string;
}

export interface PmAiIssueSignal {
  label: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface PmAiRefinementV1 {
  schemaVersion: 'pm-ai-refinement-v1';
  language: 'de';
  documentKind?: 'procedure-document' | 'case-narrative' | 'unknown';
  analysisMode?: 'process-draft' | 'exploratory-mining' | 'true-mining';
  summary?: string;
  canonicalSteps: PmAiCanonicalStep[];
  issueSignals?: PmAiIssueSignal[];
  roles?: string[];
  systems?: string[];
  warnings?: string[];
  assumptions?: string[];
}

export function buildPmAiRefinementPrompt(params: {
  process: Process;
  version: ProcessVersion;
  caseItem: ProcessMiningObservationCase;
  existingObservations: ProcessMiningObservation[];
  derivationSummary?: DerivationSummary;
}): string {
  const { process, version, caseItem, existingObservations, derivationSummary } = params;
  const happyPath = version.sidecar.captureDraft?.happyPath
    ?.slice()
    .sort((a, b) => a.order - b.order)
    .map(step => step.label)
    ?? [];

  const localSteps = existingObservations
    .filter(observation => observation.kind === 'step')
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map((observation, index) => `${index + 1}. ${observation.label}${observation.role ? ` | Rolle: ${observation.role}` : ''}`)
    .join('\n');

  const rawText = (caseItem.rawText || caseItem.narrative || '').trim();

  return [
    'Du bist ein sehr präziser Process-Mining-Analyst.',
    'Analysiere das folgende Material und liefere eine verbesserte, belastbare lokale Struktur für einen Prozessentwurf.',
    'Wichtig: Ergänze und bereinige die lokale Ableitung, aber erfinde keine Schritte ohne Evidenz im Text.',
    '',
    'Ziele:',
    '1. Erkenne die wirklich relevanten Prozessschritte in sinnvoller Reihenfolge.',
    '2. Trenne Prozessschritte klar von Reibungen, Risiken, KI-Ideen, Fazittext und Testfragen.',
    '3. Formuliere knappe, fachlich belastbare Schrittlabels.',
    '4. Erfasse wichtige Rollen, Systeme und Reibungssignale.',
    '5. Wenn nur ein Dokument oder Fall vorliegt, behandle das Ergebnis als Prozessentwurf, nicht als statistisch belastbares Mining.',
    '',
    `Prozess: ${process.title}`,
    `Quelle/Fall: ${caseItem.name}`,
    derivationSummary?.documentKind ? `Lokale Einschätzung Dokumenttyp: ${derivationSummary.documentKind}` : '',
    derivationSummary?.documentSummary ? `Lokale Einordnung: ${derivationSummary.documentSummary}` : '',
    '',
    happyPath.length > 0 ? 'Soll-Prozess / Happy Path:\n' + happyPath.map((step, index) => `${index + 1}. ${step}`).join('\n') : 'Kein Soll-Prozess vorhanden.',
    '',
    localSteps ? 'Lokale Ableitung der App:\n' + localSteps : 'Noch keine lokale Schrittableitung vorhanden.',
    '',
    'Originaltext:',
    rawText,
    '',
    'Antworte ausschließlich als JSON im folgenden Schema:',
    '{',
    '  "schemaVersion": "pm-ai-refinement-v1",',
    '  "language": "de",',
    '  "documentKind": "procedure-document" | "case-narrative" | "unknown",',
    '  "analysisMode": "process-draft" | "exploratory-mining" | "true-mining",',
    '  "summary": "kurze fachliche Einordnung",',
    '  "canonicalSteps": [',
    '    { "label": "...", "role": "optional", "system": "optional", "evidenceSnippet": "kurze Textstelle" }',
    '  ],',
    '  "issueSignals": [',
    '    { "label": "...", "description": "optional", "severity": "low" | "medium" | "high" }',
    '  ],',
    '  "roles": ["..."],',
    '  "systems": ["..."],',
    '  "warnings": ["..."],',
    '  "assumptions": ["..."]',
    '}',
    '',
    'Regeln:',
    '- canonicalSteps muss mindestens 3 sinnvolle Schritte enthalten, wenn der Text das hergibt.',
    '- Keine Tabellenüberschriften oder Testfragen als Prozessschritt ausgeben.',
    '- Nutze evidenceSnippet kurz und konkret.',
    '- Wenn der Text nur einen Einzelvorgang zeigt, setze analysisMode auf "process-draft".',
    '- Wenn Informationen fehlen, dokumentiere das in warnings oder assumptions.',
  ].filter(Boolean).join('\n');
}

export function parsePmAiRefinement(text: string): PmAiRefinementV1 {
  let cleanText = text.trim();
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  }
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0 || firstBrace >= lastBrace) {
    throw new Error('Die KI-Antwort enthält kein lesbares JSON-Objekt.');
  }
  const jsonText = cleanText.slice(firstBrace, lastBrace + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Die KI-Antwort konnte nicht als JSON gelesen werden: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Die KI-Antwort ist kein JSON-Objekt.');
  }

  const result = parsed as Partial<PmAiRefinementV1>;
  if (result.schemaVersion !== 'pm-ai-refinement-v1') {
    throw new Error('Ungültige schemaVersion. Erwartet: pm-ai-refinement-v1');
  }
  if (result.language !== 'de') {
    throw new Error('Ungültige Sprache. Erwartet: de');
  }
  if (!Array.isArray(result.canonicalSteps) || result.canonicalSteps.length === 0) {
    throw new Error('canonicalSteps fehlt oder ist leer.');
  }

  return {
    schemaVersion: 'pm-ai-refinement-v1',
    language: 'de',
    documentKind: result.documentKind ?? 'unknown',
    analysisMode: result.analysisMode ?? 'process-draft',
    summary: typeof result.summary === 'string' ? result.summary.trim() : undefined,
    canonicalSteps: result.canonicalSteps
      .filter(step => typeof step?.label === 'string' && step.label.trim().length > 0)
      .map(step => ({
        label: normalizeWhitespace(step.label),
        role: typeof step.role === 'string' ? normalizeWhitespace(step.role) : undefined,
        system: typeof step.system === 'string' ? normalizeWhitespace(step.system) : undefined,
        evidenceSnippet: typeof step.evidenceSnippet === 'string' ? normalizeWhitespace(step.evidenceSnippet) : undefined,
      })),
    issueSignals: Array.isArray(result.issueSignals)
      ? result.issueSignals
          .filter(issue => typeof issue?.label === 'string' && issue.label.trim().length > 0)
          .map(issue => ({
            label: normalizeWhitespace(issue.label),
            description: typeof issue.description === 'string' ? normalizeWhitespace(issue.description) : undefined,
            severity: issue.severity && ['low', 'medium', 'high'].includes(issue.severity)
              ? issue.severity
              : undefined,
          }))
      : undefined,
    roles: Array.isArray(result.roles) ? uniqueStrings(result.roles.filter((value): value is string => typeof value === 'string')) : undefined,
    systems: Array.isArray(result.systems) ? uniqueStrings(result.systems.filter((value): value is string => typeof value === 'string')) : undefined,
    warnings: Array.isArray(result.warnings) ? uniqueStrings(result.warnings.filter((value): value is string => typeof value === 'string')) : undefined,
    assumptions: Array.isArray(result.assumptions) ? uniqueStrings(result.assumptions.filter((value): value is string => typeof value === 'string')) : undefined,
  };
}

export function applyPmAiRefinement(params: {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  caseId: string;
  parsed: PmAiRefinementV1;
  sourceLabel: string;
  existingSummary?: DerivationSummary;
}): {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  summary: DerivationSummary;
  qualitySummary: ReturnType<typeof computeQualitySummary>;
} {
  const targetCase = params.cases.find(caseItem => caseItem.id === params.caseId);
  if (!targetCase) {
    throw new Error('Der ausgewählte Fall wurde nicht gefunden.');
  }

  const updatedCase: ProcessMiningObservationCase = {
    ...targetCase,
    derivedStepLabels: params.parsed.canonicalSteps.map(step => step.label),
    updatedAt: new Date().toISOString(),
  };

  const aiObservations: ProcessMiningObservation[] = [];
  params.parsed.canonicalSteps.forEach((step, index) => {
    aiObservations.push(
      createObservation({
        caseId: targetCase.id,
        label: step.label,
        role: step.role,
        system: step.system,
        evidenceSnippet: step.evidenceSnippet,
        sequenceIndex: index * 10,
        kind: 'step',
        timestampQuality: 'missing',
      }),
    );
  });

  params.parsed.issueSignals?.forEach((issue, index) => {
    aiObservations.push(
      createObservation({
        caseId: targetCase.id,
        label: issue.label,
        evidenceSnippet: issue.description,
        sequenceIndex: index * 10 + 1,
        kind: 'issue',
        timestampQuality: 'missing',
      }),
    );
  });

  const updatedCases = params.cases.map(caseItem => (caseItem.id === targetCase.id ? updatedCase : caseItem));
  const remainingObservations = params.observations.filter(observation => observation.sourceCaseId !== targetCase.id);
  const updatedObservations = [...remainingObservations, ...aiObservations];
  const analysisMode = params.parsed.analysisMode ?? detectProcessMiningAnalysisMode({
    cases: updatedCases,
    observations: updatedObservations,
    lastDerivationSummary: params.existingSummary,
  });

  const summary: DerivationSummary = {
    sourceLabel: params.sourceLabel,
    method: params.existingSummary?.method ?? 'narrative-fallback',
    documentKind: params.parsed.documentKind ?? params.existingSummary?.documentKind ?? 'unknown',
    analysisMode,
    caseCount: updatedCases.length,
    observationCount: updatedObservations.length,
    warnings: uniqueStrings([...(params.parsed.warnings ?? []), ...(params.parsed.assumptions ?? [])]),
    confidence: 'high',
    stepLabels: params.parsed.canonicalSteps.map(step => step.label),
    roles: uniqueStrings([...(params.parsed.roles ?? []), ...params.parsed.canonicalSteps.map(step => step.role)]),
    systems: uniqueStrings([...(params.parsed.systems ?? []), ...params.parsed.canonicalSteps.map(step => step.system)]),
    issueSignals: uniqueStrings(params.parsed.issueSignals?.map(issue => issue.label) ?? []),
    documentSummary: params.parsed.summary || buildAnalysisModeNotice({ mode: analysisMode, caseCount: updatedCases.length, documentKind: params.parsed.documentKind ?? params.existingSummary?.documentKind }),
    engineVersion: 'pm-ai-refinement-v1',
    provenance: 'ai',
    updatedAt: new Date().toISOString(),
  };

  return {
    cases: updatedCases,
    observations: updatedObservations,
    summary,
    qualitySummary: computeQualitySummary(updatedCases, updatedObservations),
  };
}
