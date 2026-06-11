// src/import/freeTextSegmenter.ts
// Wandelt frei gesprochenen, unpunktierten deutschen Diktattext in saubere,
// einzeln stehende Schritt-Saetze. Greift NUR, wenn der Text kaum Satzzeichen hat;
// bereits punktierter Text wird unveraendert zurueckgegeben (idempotent).

import type { AiCaptureResultV1 } from '../ai/aiTypes';

const ACTION_VERBS = new Set<string>([
  'stehe','stelle','schalte','lege','gehe','geh','hole','hol','gieße','giesse','nehme','teile',
  'schmiere','lese','packe','schaue','fahre','tanke','öffne','oeffne','suche','trete','stecke',
  'dusche','trockne','rasiere','ziehe','zieh','mache','beginne','lasse','finde','bringe','setze',
  'fülle','fuelle','drücke','druecke','wähle','waehle','prüfe','pruefe','starte','klicke','ankomme',
]);
const INFO_VERBS = new Set<string>(['beginnt','dauert','beträgt','betraegt','klingelt','startet','endet']);
const FRONTING = new Set<string>([
  'danach','dann','anschließend','anschliessend','zuerst','zunächst','zunaechst','daraufhin',
  'schließlich','schliesslich','währenddessen','waehrenddessen','dort','hier',
]);
const NO_SPLIT_PREV = new Set<string>([
  'und','oder','dass','daß','weil','wenn','ob','wie','wo','sobald','während','waehrend','bis',
  'damit','falls','sodass','soweit','obwohl','der','die','das','zu','sowie','plus',
]);
const PRON_ALL = new Set<string>(['ich','sie','es','er','wir','mir','mich','dich','uns','ihm','ihr']);
const SUBJECT_PRON = new Set<string>(['ich','er','wir']);
const SENT = '';

const cleanTok = (w: string): string => w.toLowerCase().replace(/[.,;:!?]/g, '');
const isVerb = (w: string): boolean => ACTION_VERBS.has(cleanTok(w));
const isInfoVerb = (w: string): boolean => INFO_VERBS.has(cleanTok(w));

function applySpokenPunctuation(t: string): string {
  return t
    .replace(/\s+Punkt\s+/g, '. ')
    .replace(/\s+Komma\s+/g, ', ')
    .replace(/\s+Fragezeichen\s+/g, '? ')
    .replace(/\s+Ausrufezeichen\s+/g, '! ')
    .replace(/\s+(neue Zeile|neuer Absatz|Absatz)\s+/gi, '. ');
}

/** Heuristik: langer Strom mit kaum Satzzeichen (typisch Diktat). */
export function looksUnderpunctuated(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 20) return false;
  const marks = (text.match(/[.!?]/g) ?? []).length;
  return marks <= Math.max(1, Math.floor(words / 40));
}

function splitIntoSentences(raw: string): string[] {
  const t = applySpokenPunctuation(raw).replace(/\s+/g, ' ').trim();
  const ws = t.split(' ');
  const out: string[] = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    const lw = cleanTok(w);
    const prev = i > 0 ? cleanTok(ws[i - 1]) : '';
    const next = i + 1 < ws.length ? cleanTok(ws[i + 1]) : '';
    const prevBoundary = i > 0 && /[.!?]$/.test(ws[i - 1]);
    const prevVerb = i > 0 && isVerb(ws[i - 1]);
    let boundary = false;
    if (i > 0 && !prevBoundary) {
      if (FRONTING.has(lw)) { if (!prevVerb) boundary = true; }
      else if (lw === 'wenn' || lw === 'sobald') { if (!prevVerb) boundary = true; }
      else if (lw === 'ich' || lw === 'er' || lw === 'wir') {
        if (!prevVerb && !NO_SPLIT_PREV.has(prev) && !FRONTING.has(prev)) boundary = true;
      } else if ((lw === 'das' || lw === 'die' || lw === 'der') && i + 1 < ws.length && isInfoVerb(ws[i + 1])) {
        boundary = true;
      } else if (isVerb(w)) {
        const block = NO_SPLIT_PREV.has(prev) || PRON_ALL.has(prev) || prevVerb
          || SUBJECT_PRON.has(next) || (i + 1 < ws.length && isVerb(ws[i + 1]));
        if (!block) boundary = true;
      }
    }
    if (boundary) out.push(SENT);
    out.push(w);
  }
  const joined = out.join(' ').replace(/\b(und|oder)\s+(\p{L}+)/gu, (m, _c, v: string) => (isVerb(v) ? `${SENT} ${v}` : m));
  const parts = joined
    .split(SENT)
    .flatMap(s => s.split(/(?<=[.!?])\s+/))
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const res: string[] = [];
  for (let part of parts) {
    part = part.replace(/^(und|oder)\s+/i, '');
    const wc = part.split(' ').filter(Boolean).length;
    if (wc < 2 && res.length) res[res.length - 1] += ` ${part}`;
    else res.push(part);
  }
  return res.map(p => {
    const s = p.charAt(0).toUpperCase() + p.slice(1);
    return /[.!?]$/.test(s) ? s : `${s}.`;
  });
}

/** Saubere Schritt-Saetze, eine pro Zeile. Bei bereits punktiertem Text: unveraendert. */
export function segmentDictatedText(text: string): string {
  if (!looksUnderpunctuated(text)) return text;
  return splitIntoSentences(text).join('\n');
}

/** Schritt-Saetze als nummerierte Liste (1., 2., …) — fuer den Struktur-Pfad der Engine.
 *  Unpunktierter Strom -> erst segmentieren; bereits zeilenweiser Text -> Zeilen nummerieren (idempotent). */
export function toNumberedStepList(text: string): string {
  const sentences = looksUnderpunctuated(text)
    ? splitIntoSentences(text)
    : text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  return sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

// --- Leichte, fokussierte Erkennung für den lokalen Diktat-Pfad (keine Engine-Logik) ---
const ROLE_RE = /\b(sachbearbeiter(?:in)?|bearbeiter(?:in)?|teamleitung|abteilungsleiter(?:in)?|vorgesetzte[rn]?|führungskraft|geschäftsführung|fachabteilung|fachbereich|einkauf|vertrieb|buchhaltung|controlling|sekretariat|poststelle|labor|qualitätssicherung|lieferant(?:in)?|kund(?:e|in)|dienstleister|techniker(?:in)?|disponent(?:in)?|mitarbeiter(?:in)?|kolleg(?:e|in)|hausmeister)\b/i;
const SYSTEM_RE = /\b(sap|erp|crm|jira|servicenow|sharepoint|portal|intranet|outlook|excel|word|powerpoint|teams|datenbank|e-?mail|software|applikation|anwendung|beamer|notebook|laptop|drucker|scanner|kaffeemaschine|backofen|ofen|kühlschrank|app|smartphone|handy|auto|aufzug|fahrstuhl|tankstelle)\b/i;
const FRICTION_RE = /\b(verzögerung|wartezeit|manuell|medienbruch|doppelt|doppelerfassung|fehlerhaft|rückfrage|nachfassen|unklar|abtippen|ausdrucken|engpass|stau)\b/i;
const DECISION_START_RE = /^(wenn|sobald|falls|sofern)\b/i;

function titleCaseWord(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Alle eindeutigen Treffer eines Lexikons im Text (originale Schreibweise, dedupliziert). */
function collectMatches(singleRe: RegExp, text: string, cap = 12): string[] {
  const globalRe = new RegExp(singleRe.source, 'gi');
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = globalRe.exec(text)) !== null) {
    const val = m[0].trim();
    const key = val.toLowerCase();
    if (val && !seen.has(key)) {
      seen.add(key);
      out.push(titleCaseWord(val));
      if (out.length >= cap) break;
    }
  }
  return out;
}

/**
 * Baut aus segmentierten Diktat-Saetzen einen minimal-validen ai-capture-v1 und
 * reichert ihn leicht an: Rollen/Systeme (Lexikon), Rolle je Schritt, Reibung
 * (exceptions) und Bedingungen (decisions). Deterministisch, keine KI, keine Engine.
 */
export function buildDictationCapture(sentences: string[]): AiCaptureResultV1 {
  const steps = sentences.map(s => s.trim()).filter(Boolean);
  const fullText = steps.join(' ');

  const roles = collectMatches(ROLE_RE, fullText);
  const systems = collectMatches(SYSTEM_RE, fullText);

  const stepDetails: NonNullable<AiCaptureResultV1['stepDetails']> = [];
  const exceptions: NonNullable<AiCaptureResultV1['exceptions']> = [];
  const decisions: NonNullable<AiCaptureResultV1['decisions']> = [];

  steps.forEach((step, i) => {
    const stepNo = i + 1; // immer in [1, steps.length]
    const roleMatch = step.match(ROLE_RE);
    if (roleMatch) stepDetails.push({ step: stepNo, role: titleCaseWord(roleMatch[0]) });
    if (FRICTION_RE.test(step)) {
      exceptions.push({
        type: 'other',
        relatedStep: stepNo,
        description: step,
        handling: 'Manuell prüfen – mögliches Automatisierungspotenzial.',
      });
    }
    if (DECISION_START_RE.test(step)) {
      decisions.push({
        afterStep: stepNo,
        question: step,
        branches: [{ conditionLabel: 'Bedingung erfüllt' }],
      });
    }
  });

  const capture: AiCaptureResultV1 = {
    schemaVersion: 'ai-capture-v1',
    language: 'de',
    endToEnd: {
      trigger: steps[0] ?? 'Prozessstart',
      customer: 'intern',
      outcome: steps[steps.length - 1] ?? 'Prozessende',
    },
    happyPath: steps,
  };
  if (roles.length) capture.roles = roles;
  if (systems.length) capture.systems = systems;
  if (stepDetails.length) capture.stepDetails = stepDetails;
  if (exceptions.length) capture.exceptions = exceptions;
  if (decisions.length) capture.decisions = decisions;
  return capture;
}
