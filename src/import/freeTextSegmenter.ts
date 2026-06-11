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

/**
 * Baut aus segmentierten Diktat-Saetzen einen minimal-validen ai-capture-v1.
 * happyPath = die Saetze; endToEnd aus erstem/letztem Schritt. Deterministisch, keine KI.
 */
export function buildDictationCapture(sentences: string[]): AiCaptureResultV1 {
  const steps = sentences.map(s => s.trim()).filter(Boolean);
  return {
    schemaVersion: 'ai-capture-v1',
    language: 'de',
    endToEnd: {
      trigger: steps[0] ?? 'Prozessstart',
      customer: 'intern',
      outcome: steps[steps.length - 1] ?? 'Prozessende',
    },
    happyPath: steps,
  };
}
