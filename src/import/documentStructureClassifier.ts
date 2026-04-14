export type StructuredDocumentClass =
  | 'structured-target-procedure'
  | 'semi-structured-procedure'
  | 'narrative-case'
  | 'mixed-document'
  | 'weak-material';

export interface StructuredSectionSignals {
  headings: number;
  numbering: number;
  flowBlocks: number;
  roleBlocks: number;
  decisionBlocks: number;
  kpiGovernanceBlocks: number;
  tableRows: number;
}

export interface DocumentStructureClassification {
  classType: StructuredDocumentClass;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  signals: StructuredSectionSignals;
}

const HEADING_RE = /^(#{1,5}\s+.+|\d{1,2}(?:\.\d{1,2})*\.?\s+[A-ZÄÖÜ].{3,120}|[A-ZÄÖÜ][A-ZÄÖÜa-zäöüß\s\-/]{5,80}:?)$/gm;
const NUMBERING_RE = /^\s*(\d{1,2}[.)]|\d{1,2}\.\d{1,2}\.?|[a-z][.)]|[-•*])\s+\S/mg;
const TABLE_ROW_RE = /^\s*\|.+\|\s*$/gm;
const FLOW_RE = /\b(ablauf|prozessschritt|verfahrensschritt|schritt|durchlauf|workflow|prozesskette)\b/gi;
const ROLE_RE = /\b(rolle|verantwortlich|zust[äa]ndig|owner|fachbereich|abteilung|teamleitung|sachbearbeiter|bearbeiter)\b/gi;
const DECISION_RE = /\b(entscheidung|wenn\s|falls\s|sonst|freigabe|genehmigung|eskalation)\b/gi;
const KPI_GOV_RE = /\b(kpi|kennzahl|sla|governance|kontrolle|compliance|risiko|audit|messgr[öo][ßs]e)\b/gi;
const NARRATIVE_RE = /\b(ich|wir|mein|meine|gestern|heute|uhr|kundin|kunde sagte|danach habe ich)\b/gi;

function countMatches(text: string, re: RegExp): number {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

export function classifyDocumentStructure(text: string): DocumentStructureClassification {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const nonEmptyLines = normalized.split('\n').filter(line => line.trim().length > 0).length;

  const signals: StructuredSectionSignals = {
    headings: countMatches(normalized, HEADING_RE),
    numbering: countMatches(normalized, NUMBERING_RE),
    flowBlocks: countMatches(normalized, FLOW_RE),
    roleBlocks: countMatches(normalized, ROLE_RE),
    decisionBlocks: countMatches(normalized, DECISION_RE),
    kpiGovernanceBlocks: countMatches(normalized, KPI_GOV_RE),
    tableRows: countMatches(normalized, TABLE_ROW_RE),
  };

  const narrativeSignals = countMatches(normalized, NARRATIVE_RE);
  const structureScore =
    signals.headings * 1.5 +
    signals.numbering * 1.4 +
    signals.tableRows * 1.7 +
    signals.flowBlocks * 1.2 +
    signals.roleBlocks * 1.0 +
    signals.decisionBlocks * 1.1 +
    signals.kpiGovernanceBlocks * 1.0;
  const density = nonEmptyLines > 0 ? (signals.numbering + signals.tableRows + signals.headings) / nonEmptyLines : 0;

  const reasons: string[] = [];
  let classType: StructuredDocumentClass = 'weak-material';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  const explicitWorkflowTableSignals =
    signals.tableRows >= 6 &&
    signals.headings >= 2 &&
    signals.flowBlocks >= 2 &&
    signals.roleBlocks >= 1;

  if (
    structureScore >= 18 &&
    (
      (signals.tableRows >= 2 && signals.numbering >= 2) ||
      explicitWorkflowTableSignals
    )
  ) {
    classType = 'structured-target-procedure';
    confidence = density >= 0.35 ? 'high' : 'medium';
    reasons.push(
      explicitWorkflowTableSignals
        ? 'Klare Workflow-Tabellen mit Rollen-, Ablauf- und Abschnittssignalen erkannt.'
        : 'Viele Strukturmarker mit Tabellen- und Nummerierungsblöcken erkannt.',
    );
  } else if (structureScore >= 12 && (signals.numbering >= 2 || signals.headings >= 2)) {
    classType = 'semi-structured-procedure';
    confidence = structureScore >= 16 ? 'high' : 'medium';
    reasons.push('Mehrere strukturierte Abschnitte und Ablaufsignale gefunden.');
  } else if (structureScore >= 8 && narrativeSignals >= 3) {
    classType = 'mixed-document';
    confidence = 'medium';
    reasons.push('Sowohl Verfahrenssignale als auch narrative Signale vorhanden.');
  } else if (narrativeSignals >= 4) {
    classType = 'narrative-case';
    confidence = narrativeSignals >= 7 ? 'high' : 'medium';
    reasons.push('Überwiegend narrative Signale ohne stabile Verfahrensstruktur.');
  } else {
    classType = 'weak-material';
    confidence = nonEmptyLines > 12 ? 'medium' : 'low';
    reasons.push('Zu wenig belastbare Struktur- oder Narrativsignale.');
  }

  if (signals.decisionBlocks > 0) reasons.push('Entscheidungs-/Freigabesignale vorhanden.');
  if (signals.roleBlocks > 0) reasons.push('Rollen-/Verantwortungsblöcke vorhanden.');
  if (signals.kpiGovernanceBlocks > 0) reasons.push('KPI-/Governance-Blöcke vorhanden.');

  return { classType, confidence, reasons, signals };
}
