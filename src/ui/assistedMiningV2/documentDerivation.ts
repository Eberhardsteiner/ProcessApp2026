import type {
  DerivationSummary,
  ProcessMiningAnalysisMode,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import { findDocumentProcessCandidates } from '../../import/documentProcessDiscovery';
import { extractSemiStructuredProcedureFromText } from '../../import/semiStructuredProcedureExtraction';
import type { SemiStructuredProcedureStep } from '../../import/semiStructuredProcedureExtraction';
import { extractStructuredProcedureFromText } from '../../import/structuredProcedureExtraction';
import type { StructuredProcedureStep } from '../../import/structuredProcedureExtraction';
import { extractObservationsFromCase } from './narrativeParsing';
import {
  buildAnalysisModeNotice,
  createObservation,
  detectProcessMiningAnalysisMode,
  normalizeLabel,
  normalizeWhitespace,
  sentenceCase,
  uniqueStrings,
} from './pmShared';

export interface DerivationInput {
  text: string;
  fileName?: string;
  sourceType: 'pdf' | 'docx' | 'narrative' | 'csv-row' | 'xlsx-row';
}

export interface DerivationResult {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  method: 'structured' | 'semi-structured' | 'narrative-fallback';
  documentKind: 'procedure-document' | 'case-narrative' | 'unknown';
  warnings: string[];
  confidence: 'high' | 'medium' | 'low';
  derivedSteps: Array<{ label: string; role?: string; evidenceSnippet?: string }>;
  roles: string[];
  systems: string[];
  issueSignals: string[];
  summary: DerivationSummary;
}

const ENGINE_VERSION = 'pm-local-engine-v2.1';
const MIN_USEFUL_STEPS = 3;
const MAX_NARRATIVE_LENGTH_IN_CASE = 2000;

interface CandidateBlock {
  title: string;
  body: string;
  timestampRaw?: string;
}

const TIME_HEADING_RE = /^(\d{1,2}:\d{2}\s*Uhr)\s*\|\s*(.+)$/i;
const MAJOR_HEADING_RE = /^\s*([1-9])\.\s+(.+)$/;
const STORY_HEADING_RE = /^\s*3\.\s+Die Geschichte\s*$/im;
const HEADING_BLOCKLIST = [
  /rahmen der geschichte/i,
  /die person im prozess/i,
  /tagesverlauf/i,
  /ki-unterstützung/i,
  /kurzfazit/i,
  /welche signale/i,
  /beispielfragen/i,
  /app-test/i,
];

const ROLE_PATTERNS: Array<[RegExp, string]> = [
  [/\bservicekoordinator(?:in)?\b/i, 'Servicekoordination'],
  [/\bqualitätsmanagement\b|\bqm\b/i, 'Qualitätsmanagement'],
  [/\btechnik\b|\btechniker(?:in)?\b/i, 'Technik'],
  [/\bteamleitung\b/i, 'Teamleitung'],
  [/\bvertrieb\b/i, 'Vertrieb'],
  [/\blogistik\b/i, 'Logistik'],
  [/\bkey-?account\b/i, 'Key Account'],
  [/\bkunde\b/i, 'Kunde'],
  [/\bsachbearbeiter(?:in)?\b/i, 'Sachbearbeitung'],
];

const SYSTEM_PATTERNS: Array<[RegExp, string]> = [
  [/\bcrm\b/i, 'CRM'],
  [/\berp\b/i, 'ERP'],
  [/\bdms\b|dokumentenmanagement/i, 'DMS'],
  [/\be-?mail\b|postfach/i, 'E-Mail'],
  [/\bchat\b/i, 'Chat'],
  [/\btelefon(?:at)?\b/i, 'Telefon'],
  [/\bremote\b/i, 'Remote-Support'],
  [/\breport\b/i, 'Reporting'],
];

const ISSUE_PATTERNS: Array<[RegExp, string]> = [
  [/seriennummer|auftragsnummer|fehlende information|mindestdaten|pflichtangaben/i, 'Fehlende Pflichtangaben verzögern den Fallstart'],
  [/crm|erp|e-?mail|dokumentenmanagement|zwischen fenstern|mehreren systemen/i, 'Informationen müssen aus mehreren Systemen zusammengeführt werden'],
  [/priorit|eskalationsmodus|risikoabwägung|unsicherheit/i, 'Priorisierung erfolgt unter Unsicherheit'],
  [/warte|wartet|wartezeiten|noch auf antworten|halte den druck aus/i, 'Wartezeiten und Koordinationsaufwand belasten den Ablauf'],
  [/ähnlich(?:en)? fäll|wissensspeicher|erinnerung|postfach entdecke ich/i, 'Erfahrungswissen ist schlecht auffindbar'],
  [/kundenfähige sprache|zwischenmeldung|kommunikation|abschlussmail|kernaussage/i, 'Hohe Kommunikationslast und Mehrfachdokumentation'],
  [/freigabe|kulanz|teamleitung und vertrieb/i, 'Freigaben verzögern die Umsetzung'],
];

const STEP_MAP: Array<[RegExp, string]> = [
  [/fall taucht auf|posteingang|reklamation|eingang|betreffzeile/i, 'Reklamationseingang sichten und Erstlage bewerten'],
  [/crm|erp|dokumentenmanagement|lieferschein|kontext|systems? zusammen/i, 'Kunden-, Auftrags- und Produktkontext in den Systemen zusammenführen'],
  [/priorit|eskalation|qualitätsabweichung|rückfrage|fehlende angaben anfordern/i, 'Priorität festlegen und fehlende Angaben anfordern'],
  [/qualitätsmanagement|technik|fachliche bewertung|temperatursensor|festlegen/i, 'Fachliche Bewertung mit Qualität und Technik anstoßen'],
  [/ähnlich(?:en)? fäll|alte e-?mail-kette|wissensspeicher|erfahrung/i, 'Ähnliche Fälle und Erfahrungswissen recherchieren'],
  [/zwischenmeldung|kunde ruft an|zwischenstand|erwartungsmanagement/i, 'Zwischenstand an den Kunden kommunizieren'],
  [/lösung entsteht|maßnahmenpaket|express|remote|logistik prüft|pragmatische lösung/i, 'Lösung mit Technik, QM und Logistik abstimmen'],
  [/freigabe|ersatzauftrag|ersatzbestellung|kundenmail|informiere die logistik|dokumentiere den zwischenstand/i, 'Freigabe einholen und Maßnahme auslösen'],
  [/gelöst|maßnahme läuft|status|beruhigt|aufwand bleibt unsichtbar/i, 'Status aktualisieren und Fall nachhalten'],
  [/prüf|überprüf|kontroll/i, 'Sachverhalt prüfen'],
  [/informier|benachrichtig|kommunizier/i, 'Beteiligte informieren'],
  [/dokumentier|erfass|anleg/i, 'Fall dokumentieren'],
];

function cleanInputText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, ' ').trim();
}

function buildCase(params: {
  name: string;
  narrative: string;
  rawText: string;
  sourceNote?: string;
  sourceType: ProcessMiningObservationCase['sourceType'];
  inputKind: ProcessMiningObservationCase['inputKind'];
  derivedStepLabels?: string[];
}): ProcessMiningObservationCase {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: params.name,
    narrative: params.narrative,
    rawText: params.rawText,
    sourceNote: params.sourceNote,
    sourceType: params.sourceType,
    inputKind: params.inputKind,
    derivedStepLabels: params.derivedStepLabels,
    createdAt: now,
    updatedAt: now,
  };
}

function getSourceName(fileName: string | undefined, sourceType: DerivationInput['sourceType']): string {
  return fileName ?? (sourceType === 'narrative' ? 'Freitext' : 'Import');
}

function sliceNarrative(text: string): string {
  const trimmed = cleanInputText(text);
  if (trimmed.length <= MAX_NARRATIVE_LENGTH_IN_CASE) return trimmed;
  return `${trimmed.slice(0, MAX_NARRATIVE_LENGTH_IN_CASE).trimEnd()}…`;
}

function extractStorySection(text: string): string | null {
  const match = STORY_HEADING_RE.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  const after = text.slice(start);
  const nextHeading = after.match(/^\s*[4-9]\.\s+.+$/m);
  const storyText = nextHeading ? after.slice(0, nextHeading.index).trim() : after.trim();
  return storyText || null;
}

function isMostlyNarrative(text: string): boolean {
  const lower = text.toLowerCase();
  const firstPersonSignals = (lower.match(/\b(ich|wir|mein|meine|mich|uns)\b/g) ?? []).length;
  const timeHeadings = (text.match(/^\d{1,2}:\d{2}\s*Uhr\s*\|/gm) ?? []).length;
  return timeHeadings >= 2 || firstPersonSignals >= 5 || /die geschichte/i.test(text);
}

function extractTimelineBlocks(text: string): CandidateBlock[] {
  const relevantText = extractStorySection(text) ?? text;
  const lines = relevantText.split('\n');
  const blocks: CandidateBlock[] = [];
  let current: CandidateBlock | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const blockedHeading = line.match(MAJOR_HEADING_RE);
    if (blockedHeading && Number(blockedHeading[1]) >= 4) {
      break;
    }
    const timeMatch = line.match(TIME_HEADING_RE);
    if (timeMatch) {
      if (current && normalizeWhitespace(`${current.title} ${current.body}`).length > 20) {
        blocks.push(current);
      }
      current = {
        timestampRaw: timeMatch[1],
        title: normalizeWhitespace(timeMatch[2]),
        body: '',
      };
      continue;
    }
    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line;
    }
  }

  if (current && normalizeWhitespace(`${current.title} ${current.body}`).length > 20) {
    blocks.push(current);
  }

  return blocks;
}

function candidateTexts(text: string, refId: string): string[] {
  const candidates = findDocumentProcessCandidates([{ refId, text }], { maxCandidates: 5 });
  if (candidates.length === 0) return [text];
  return uniqueStrings(candidates.map(c => c.text));
}

function isBlockedParagraph(paragraph: string): boolean {
  if (!paragraph) return true;
  const firstLine = paragraph.split('\n')[0] ?? paragraph;
  if (HEADING_BLOCKLIST.some(re => re.test(firstLine))) return true;
  if (/^\d+\)\s+/.test(paragraph)) return true;
  if (/^signal$/i.test(paragraph) || /^nutzen/i.test(paragraph)) return true;
  return false;
}

function paragraphBlocksFromText(text: string): CandidateBlock[] {
  const source = extractStorySection(text) ?? text;
  return source
    .split(/\n{2,}/)
    .map(chunk => normalizeWhitespace(chunk))
    .filter(chunk => chunk.length > 40)
    .filter(chunk => !isBlockedParagraph(chunk))
    .map(chunk => {
      const firstSentence = chunk.split(/(?<=[.!?])\s+/)[0] ?? chunk;
      return { title: sentenceCase(firstSentence), body: chunk };
    });
}

function canonicalStepLabel(title: string, body: string, index: number): string {
  const haystack = `${title} ${body}`;
  for (const [re, label] of STEP_MAP) {
    if (re.test(haystack)) return label;
  }
  const fallback = sentenceCase(title.replace(/^\d{1,2}:\d{2}\s*Uhr\s*\|\s*/i, '').replace(/[|:]+$/, ''));
  if (fallback && fallback.length <= 90) return fallback;
  return `Schritt ${index + 1}`;
}

function extractRoles(text: string): string[] {
  return uniqueStrings(ROLE_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label));
}

function extractSystems(text: string): string[] {
  return uniqueStrings(SYSTEM_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label));
}

function extractIssueSignals(text: string): string[] {
  return uniqueStrings(ISSUE_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label));
}

function toObservationsFromStructured(caseId: string, steps: StructuredProcedureStep[]): ProcessMiningObservation[] {
  return steps.map((step, index) =>
    createObservation({
      caseId,
      label: step.label,
      sequenceIndex: index,
      role: step.responsible,
      evidenceSnippet: step.evidenceSnippet,
      kind: 'step',
      timestampQuality: 'missing',
    }),
  );
}

function toObservationsFromSemiStructured(caseId: string, steps: SemiStructuredProcedureStep[]): ProcessMiningObservation[] {
  return steps.map((step, index) =>
    createObservation({
      caseId,
      label: step.label,
      sequenceIndex: index,
      role: step.responsible,
      evidenceSnippet: step.evidenceSnippet,
      kind: 'step',
      timestampQuality: 'missing',
    }),
  );
}

function dedupeDerivedSteps(steps: Array<{ label: string; role?: string; evidenceSnippet?: string; timestampRaw?: string; systems?: string[]; issueSignals?: string[] }>) {
  const seen = new Set<string>();
  return steps.filter(step => {
    const key = normalizeLabel(step.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildNarrativeDerivation(params: {
  blocks: CandidateBlock[];
  sourceName: string;
  sourceType: DerivationInput['sourceType'];
  rawText: string;
  warnings: string[];
  baseConfidence?: 'high' | 'medium' | 'low';
}): DerivationResult | null {
  const { blocks, sourceName, sourceType, rawText, warnings, baseConfidence = 'medium' } = params;
  const derivedStepCandidates = dedupeDerivedSteps(
    blocks
      .map((block, index) => {
        const stepLabel = canonicalStepLabel(block.title, block.body, index);
        const roles = extractRoles(`${block.title} ${block.body}`);
        const systems = extractSystems(block.body);
        const issues = extractIssueSignals(block.body);
        return {
          label: stepLabel,
          role: roles[0],
          evidenceSnippet: normalizeWhitespace(`${block.title}. ${block.body}`).slice(0, 320),
          timestampRaw: block.timestampRaw,
          systems,
          issueSignals: issues,
        };
      })
      .filter(step => step.label && step.label.length >= 4),
  );

  if (derivedStepCandidates.length < 2) return null;

  const caseItem = buildCase({
    name: sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(blocks.map(b => `${b.timestampRaw ? `${b.timestampRaw} | ` : ''}${b.title}\n${b.body}`).join('\n\n')),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: derivedStepCandidates.map(step => step.label),
  });

  const observations: ProcessMiningObservation[] = [];
  derivedStepCandidates.forEach((step, index) => {
    observations.push(
      createObservation({
        caseId: caseItem.id,
        label: step.label,
        sequenceIndex: index * 10,
        role: step.role,
        system: step.systems?.[0],
        evidenceSnippet: step.evidenceSnippet,
        timestampRaw: step.timestampRaw,
        timestampQuality: step.timestampRaw ? 'synthetic' : 'missing',
        kind: 'step',
      }),
    );
    step.issueSignals?.slice(0, 2).forEach((issue, issueIndex) => {
      observations.push(
        createObservation({
          caseId: caseItem.id,
          label: issue,
          sequenceIndex: index * 10 + issueIndex + 1,
          evidenceSnippet: step.evidenceSnippet,
          kind: 'issue',
          timestampQuality: 'missing',
        }),
      );
    });
  });

  const roles = uniqueStrings(derivedStepCandidates.map(step => step.role));
  const systems = uniqueStrings(derivedStepCandidates.flatMap(step => step.systems ?? []));
  const issueSignals = uniqueStrings(derivedStepCandidates.flatMap(step => step.issueSignals ?? []));
  const analysisMode: ProcessMiningAnalysisMode = 'process-draft';
  const confidence: 'high' | 'medium' | 'low' = derivedStepCandidates.length >= 5 ? baseConfidence : 'medium';
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'narrative-fallback',
    documentKind: 'case-narrative',
    analysisMode,
    caseCount: 1,
    observationCount: observations.length,
    warnings,
    confidence,
    stepLabels: derivedStepCandidates.map(step => step.label),
    roles,
    systems,
    issueSignals,
    documentSummary: buildAnalysisModeNotice({ mode: analysisMode, caseCount: 1, documentKind: 'case-narrative' }),
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };

  return {
    cases: [caseItem],
    observations,
    method: 'narrative-fallback',
    documentKind: 'case-narrative',
    warnings,
    confidence,
    derivedSteps: derivedStepCandidates.map(step => ({ label: step.label, role: step.role, evidenceSnippet: step.evidenceSnippet })),
    roles,
    systems,
    issueSignals,
    summary,
  };
}

function buildStructuredDerivation(params: {
  steps: StructuredProcedureStep[];
  roles: string[];
  warnings: string[];
  title?: string;
  sourceName: string;
  sourceType: DerivationInput['sourceType'];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence } = params;
  const derivedSteps = steps.map(step => ({ label: step.label, role: step.responsible, evidenceSnippet: step.evidenceSnippet }));
  const caseItem = buildCase({
    name: title ?? sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(rawText),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: derivedSteps.map(step => step.label),
  });
  const observations = toObservationsFromStructured(caseItem.id, steps);
  const systems = extractSystems(rawText);
  const issueSignals = extractIssueSignals(rawText);
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'structured',
    documentKind: 'procedure-document',
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: observations.length,
    warnings,
    confidence,
    stepLabels: derivedSteps.map(step => step.label),
    roles,
    systems,
    issueSignals,
    documentSummary: buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'procedure-document' }),
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return {
    cases: [caseItem],
    observations,
    method: 'structured',
    documentKind: 'procedure-document',
    warnings,
    confidence,
    derivedSteps,
    roles,
    systems,
    issueSignals,
    summary,
  };
}

function buildSemiStructuredDerivation(params: {
  steps: SemiStructuredProcedureStep[];
  roles: string[];
  warnings: string[];
  title?: string;
  sourceName: string;
  sourceType: DerivationInput['sourceType'];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence } = params;
  const derivedSteps = steps.map(step => ({ label: step.label, role: step.responsible, evidenceSnippet: step.evidenceSnippet }));
  const caseItem = buildCase({
    name: title ?? sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(rawText),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: derivedSteps.map(step => step.label),
  });
  const observations = toObservationsFromSemiStructured(caseItem.id, steps);
  const systems = extractSystems(rawText);
  const issueSignals = extractIssueSignals(rawText);
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'semi-structured',
    documentKind: 'procedure-document',
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: observations.length,
    warnings,
    confidence,
    stepLabels: derivedSteps.map(step => step.label),
    roles,
    systems,
    issueSignals,
    documentSummary: buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'procedure-document' }),
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return {
    cases: [caseItem],
    observations,
    method: 'semi-structured',
    documentKind: 'procedure-document',
    warnings,
    confidence,
    derivedSteps,
    roles,
    systems,
    issueSignals,
    summary,
  };
}

function buildEmptyResult(sourceName: string, sourceType: DerivationInput['sourceType'], text: string, warning: string): DerivationResult {
  const caseItem = buildCase({
    name: sourceName,
    narrative: sliceNarrative(text),
    rawText: text,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
  });
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'narrative-fallback',
    documentKind: 'unknown',
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: 0,
    warnings: [warning],
    confidence: 'low',
    stepLabels: [],
    roles: [],
    systems: [],
    issueSignals: [],
    documentSummary: buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'unknown' }),
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return {
    cases: [caseItem],
    observations: [],
    method: 'narrative-fallback',
    documentKind: 'unknown',
    warnings: [warning],
    confidence: 'low',
    derivedSteps: [],
    roles: [],
    systems: [],
    issueSignals: [],
    summary,
  };
}

export function deriveProcessArtifactsFromText(input: DerivationInput): DerivationResult {
  const rawText = cleanInputText(input.text);
  const sourceName = getSourceName(input.fileName, input.sourceType);

  if (rawText.length < 20) {
    return buildEmptyResult(sourceName, input.sourceType, rawText, 'Text zu kurz oder leer — keine Schritte erkennbar.');
  }

  const warnings: string[] = [];
  const roles = extractRoles(rawText);
  const systems = extractSystems(rawText);
  const issueSignals = extractIssueSignals(rawText);
  const storyBlocks = extractTimelineBlocks(rawText);

  if (isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
    const narrativeResult = buildNarrativeDerivation({
      blocks: storyBlocks,
      sourceName,
      sourceType: input.sourceType,
      rawText,
      warnings,
      baseConfidence: storyBlocks.length >= 5 ? 'high' : 'medium',
    });
    if (narrativeResult) {
      narrativeResult.roles = uniqueStrings([...narrativeResult.roles, ...roles]);
      narrativeResult.systems = uniqueStrings([...narrativeResult.systems, ...systems]);
      narrativeResult.issueSignals = uniqueStrings([...narrativeResult.issueSignals, ...issueSignals]);
      narrativeResult.summary.roles = narrativeResult.roles;
      narrativeResult.summary.systems = narrativeResult.systems;
      narrativeResult.summary.issueSignals = narrativeResult.issueSignals;
      narrativeResult.summary.documentSummary = `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'case-narrative' })} ${issueSignals.length > 0 ? `Wichtige Reibungssignale: ${issueSignals.slice(0, 3).join(', ')}.` : ''}`.trim();
      return narrativeResult;
    }
  }

  for (const candidateText of candidateTexts(rawText, sourceName)) {
    const structured = extractStructuredProcedureFromText(sourceName, candidateText);
    if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
      return buildStructuredDerivation({
        steps: structured.steps,
        roles: uniqueStrings([...structured.roles.map(role => role.name), ...roles, ...structured.steps.map(step => step.responsible)]),
        warnings: uniqueStrings([...structured.warnings, ...warnings]),
        title: structured.title,
        sourceName,
        sourceType: input.sourceType,
        rawText,
        confidence: 'high',
      });
    }
  }

  for (const candidateText of candidateTexts(rawText, sourceName)) {
    const semiStructured = extractSemiStructuredProcedureFromText(sourceName, candidateText);
    if (semiStructured && semiStructured.steps.length >= MIN_USEFUL_STEPS) {
      return buildSemiStructuredDerivation({
        steps: semiStructured.steps,
        roles: uniqueStrings([...semiStructured.roles, ...roles, ...semiStructured.steps.map(step => step.responsible)]),
        warnings: uniqueStrings([...semiStructured.warnings, ...warnings]),
        title: semiStructured.title,
        sourceName,
        sourceType: input.sourceType,
        rawText,
        confidence: semiStructured.confidence,
      });
    }
  }

  const paragraphBlocks = paragraphBlocksFromText(rawText);
  if (paragraphBlocks.length >= 2) {
    const narrativeResult = buildNarrativeDerivation({
      blocks: paragraphBlocks,
      sourceName,
      sourceType: input.sourceType,
      rawText,
      warnings: uniqueStrings([...warnings, 'Lokale Narrative-Heuristik verwendet, weil keine klare Verfahrensstruktur erkannt wurde.']),
      baseConfidence: paragraphBlocks.length >= MIN_USEFUL_STEPS ? 'medium' : 'low',
    });
    if (narrativeResult) {
      narrativeResult.roles = uniqueStrings([...narrativeResult.roles, ...roles]);
      narrativeResult.systems = uniqueStrings([...narrativeResult.systems, ...systems]);
      narrativeResult.issueSignals = uniqueStrings([...narrativeResult.issueSignals, ...issueSignals]);
      narrativeResult.summary.roles = narrativeResult.roles;
      narrativeResult.summary.systems = narrativeResult.systems;
      narrativeResult.summary.issueSignals = narrativeResult.issueSignals;
      return narrativeResult;
    }
  }

  warnings.push('Keine belastbare Prozessstruktur erkannt — einfacher Satz-Fallback wird verwendet.');
  const fallbackCase = buildCase({
    name: sourceName,
    narrative: sliceNarrative(rawText),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType: input.sourceType,
    inputKind: input.sourceType === 'narrative' ? 'narrative' : 'document',
  });
  const { observations: fallbackObs } = extractObservationsFromCase(fallbackCase);
  const usableObs = fallbackObs.length > 0 ? fallbackObs : [];
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'narrative-fallback',
    documentKind: 'unknown',
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: usableObs.length,
    warnings,
    confidence: 'low',
    stepLabels: usableObs.filter(obs => obs.kind === 'step').map(obs => obs.label),
    roles,
    systems,
    issueSignals,
    documentSummary: buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'unknown' }),
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return {
    cases: [fallbackCase],
    observations: usableObs,
    method: 'narrative-fallback',
    documentKind: 'unknown',
    warnings,
    confidence: 'low',
    derivedSteps: usableObs.filter(obs => obs.kind === 'step').map(obs => ({ label: obs.label, evidenceSnippet: obs.evidenceSnippet })),
    roles,
    systems,
    issueSignals,
    summary,
  };
}

export function deriveFromMultipleTexts(
  inputs: Array<{ text: string; name: string; sourceType: DerivationInput['sourceType'] }>,
): {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  summaries: DerivationSummary[];
  combinedSummary: DerivationSummary;
  totalSteps: number;
  warnings: string[];
} {
  const cases: ProcessMiningObservationCase[] = [];
  const observations: ProcessMiningObservation[] = [];
  const summaries: DerivationSummary[] = [];
  const warnings: string[] = [];
  let stepCount = 0;

  for (const input of inputs) {
    const result = deriveProcessArtifactsFromText({ text: input.text, fileName: input.name, sourceType: input.sourceType });
    cases.push(...result.cases);
    observations.push(...result.observations);
    summaries.push(result.summary);
    warnings.push(...result.warnings);
    stepCount += result.derivedSteps.length;
  }

  const analysisMode = detectProcessMiningAnalysisMode({ cases, observations, lastDerivationSummary: summaries[0] });
  const combinedSummary: DerivationSummary = {
    sourceLabel: inputs.length === 1 ? inputs[0].name : `${inputs.length} importierte Beschreibungen`,
    method: summaries.some(summary => summary.method === 'structured')
      ? 'structured'
      : summaries.some(summary => summary.method === 'semi-structured')
      ? 'semi-structured'
      : 'narrative-fallback',
    documentKind: inputs.length > 1 ? 'case-narrative' : summaries[0]?.documentKind ?? 'unknown',
    analysisMode,
    caseCount: cases.length,
    observationCount: observations.length,
    warnings: uniqueStrings(warnings),
    confidence: observations.length >= 12 ? 'high' : observations.length >= 6 ? 'medium' : 'low',
    stepLabels: uniqueStrings(observations.filter(obs => obs.kind === 'step').map(obs => obs.label)).slice(0, 20),
    roles: uniqueStrings(summaries.flatMap(summary => summary.roles)),
    systems: uniqueStrings(summaries.flatMap(summary => summary.systems ?? [])),
    issueSignals: uniqueStrings(summaries.flatMap(summary => summary.issueSignals ?? [])),
    documentSummary: buildAnalysisModeNotice({ mode: analysisMode, caseCount: cases.length, documentKind: inputs.length > 1 ? 'case-narrative' : summaries[0]?.documentKind }),
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };

  return {
    cases,
    observations,
    summaries,
    combinedSummary,
    totalSteps: stepCount,
    warnings: uniqueStrings(warnings),
  };
}
