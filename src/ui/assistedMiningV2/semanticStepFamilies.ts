import { normalizeLabel, normalizeWhitespace, sentenceCase } from './pmShared';

export interface StepFamilyDefinition {
  id: string;
  label: string;
  patterns: RegExp[];
  aliases?: string[];
}

export interface StepFamilyMatch {
  id: string;
  label: string;
  score: number;
}

const STOP_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einen', 'einem', 'und', 'oder', 'mit', 'fuer', 'für',
  'von', 'im', 'in', 'am', 'an', 'auf', 'zu', 'zum', 'zur', 'bei', 'nach', 'vor', 'ueber', 'über', 'unter', 'als', 'wird',
  'werden', 'ist', 'sind', 'noch', 'mehr', 'durch', 'denn', 'ohne', 'aus', 'bis', 'per', 'vom', 'beim', 'dass', 'wie', 'so',
  'hier', 'dort', 'teilweise', 'muss', 'muessen', 'müssen', 'kann', 'koennen', 'können', 'soll', 'sollen', 'bereits', 'danach',
  'anschliessend', 'anschließend', 'zunaechst', 'zunächst', 'zuerst', 'spaeter', 'später', 'frueh', 'früh', 'ende', 'tag', 'uhr',
  'fall', 'vorgang', 'prozess', 'schritt', 'massnahme', 'maßnahme', 'aktiv', 'bearbeitung', 'weiter', 'hoch', 'niedrig', 'klar',
]);

export const STEP_FAMILIES: StepFamilyDefinition[] = [
  {
    id: 'complaint_intake',
    label: 'Reklamationseingang erfassen und Erstlage bewerten',
    patterns: [
      /\breklamation(?:s)?eingang\b/i,
      /\bfall taucht auf\b/i,
      /\bposteingang\b/i,
      /\bbetreffzeile\b/i,
      /\berstlage\b/i,
      /\beingang\b.*\bbewert/i,
      /\bdringend\b.*\bstillstand\b/i,
    ],
  },
  {
    id: 'context_assembly',
    label: 'Kunden-, Auftrags- und Produktkontext zusammenführen',
    patterns: [
      /\bcrm\b/i,
      /\berp\b/i,
      /\bdokumentenmanagement\b/i,
      /\bdms\b/i,
      /\blieferschein\b/i,
      /\bkontext\b/i,
      /\bzusammenfuehren\b|\bzusammenführen\b/i,
      /\bvariant[e|en]\b.*\bbetroffen\b/i,
      /\bdatenspur\b/i,
    ],
  },
  {
    id: 'prioritize_and_request',
    label: 'Priorität festlegen und fehlende Angaben anfordern',
    patterns: [
      /\bpriorit/i,
      /\beskalation/i,
      /\bqualitaetsabweichung\b|\bqualitätsabweichung\b/i,
      /\brueckfrage\b|\brückfrage\b/i,
      /\bfehlend(?:e|er|en)?\b.*\bangab/i,
      /\bseriennummer\b/i,
      /\bauftragsnummer\b/i,
      /\bpflichtangaben\b/i,
    ],
  },
  {
    id: 'technical_assessment',
    label: 'Fachliche Bewertung mit Qualität und Technik anstoßen',
    patterns: [
      /\bfachliche bewertung\b/i,
      /\bqualitaetsmanagement\b|\bqualitätsmanagement\b|\bqm\b/i,
      /\btechnik\b/i,
      /\btemperatursensor\b/i,
      /\bfestlegen\b/i,
      /\bbewertung startet\b/i,
    ],
  },
  {
    id: 'knowledge_lookup',
    label: 'Ähnliche Fälle und Erfahrungswissen recherchieren',
    patterns: [
      /\baehnlich(?:e|en)?\b|\bähnlich(?:e|en)?\b/i,
      /\bwissensspeicher\b/i,
      /\bpostfach\b/i,
      /\balte e-?mail\b/i,
      /\berfahrung\b/i,
      /\bfall(?:e)? suchen\b/i,
    ],
  },
  {
    id: 'customer_update',
    label: 'Zwischenstand an den Kunden kommunizieren',
    patterns: [
      /\bzwischenmeldung\b/i,
      /\bzwischenstand\b/i,
      /\bkunde ruft an\b/i,
      /\berwartungsmanagement\b/i,
      /\bkundenfaehig\b|\bkundenfähig\b/i,
      /\bkommunik/i,
    ],
  },
  {
    id: 'solution_coordination',
    label: 'Lösung mit Fachbereichen abstimmen',
    patterns: [
      /\bloesung entsteht\b|\blösung entsteht\b/i,
      /\bmassnahmenpaket\b|\bmaßnahmenpaket\b/i,
      /\bexpress\b/i,
      /\bremote\b/i,
      /\blogistik\b/i,
      /\bpragmatische loesung\b|\bpragmatische lösung\b/i,
      /\babstimm/i,
    ],
  },
  {
    id: 'approval',
    label: 'Freigabe und Kulanzentscheidung einholen',
    patterns: [
      /\bfreigabe\b/i,
      /\bkulanz\b/i,
      /\bteamleitung\b/i,
      /\bvertrieb\b/i,
      /\bgenehmig/i,
      /\bkosten\b/i,
    ],
  },
  {
    id: 'execution',
    label: 'Maßnahme auslösen und Beteiligte informieren',
    patterns: [
      /\bersatzauftrag\b/i,
      /\bersatzbestell/i,
      /\bausloesen\b|\bauslösen\b/i,
      /\blogistik inform/i,
      /\bkundenmail\b/i,
      /\bmassnahme laeuft\b|\bmaßnahme läuft\b/i,
      /\bexpress raus\b/i,
    ],
  },
  {
    id: 'documentation_followup',
    label: 'Status dokumentieren und Fall nachhalten',
    patterns: [
      /\bdokumentier/i,
      /\bstatus\b/i,
      /\bnachvollziehbarkeit\b/i,
      /\breport\b/i,
      /\bnachhalten\b/i,
      /\babschluss\b/i,
    ],
  },
];

function stemToken(token: string): string {
  return token
    .replace(/[ä]/g, 'ae')
    .replace(/[ö]/g, 'oe')
    .replace(/[ü]/g, 'ue')
    .replace(/[ß]/g, 'ss')
    .replace(/(ungen|ung|ern|erns|eren|erer|ererin|ererinnen|erin|innen|ende|enden|endem|ender|ers|er|en|em|es|e|n)$/i, '')
    .trim();
}

export function tokenizeProcessLabel(value: string): string[] {
  return normalizeLabel(value)
    .replace(/[()\[\],.:;!?/|]+/g, ' ')
    .replace(/reklamationseingang/g, 'reklamation eingang')
    .replace(/zwischenmeldung/g, 'zwischen meldung')
    .replace(/ersatzauftrag/g, 'ersatz auftrag')
    .replace(/kundenmail/g, 'kunden mail')
    .replace(/massnahme/g, 'maßnahme')
    .split(/\s+/)
    .map(stemToken)
    .filter(token => token.length >= 3)
    .filter(token => !STOP_WORDS.has(token));
}

export function inferStepFamily(value: string): StepFamilyMatch | null {
  const text = normalizeWhitespace(value);
  if (!text) return null;

  let best: StepFamilyMatch | null = null;
  for (const family of STEP_FAMILIES) {
    let score = 0;
    for (const pattern of family.patterns) {
      if (pattern.test(text)) {
        score += 1;
      }
    }
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { id: family.id, label: family.label, score };
    }
  }

  return best && best.score >= 1 ? best : null;
}

function cleanFallbackLabel(value: string): string {
  const cleaned = normalizeWhitespace(
    value
      .replace(/^\d{1,2}:\d{2}\s*Uhr\s*\|\s*/i, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/[|:]+$/, ''),
  );
  if (!cleaned) return 'Schritt';
  const shortened = cleaned.length > 110 ? `${cleaned.slice(0, 107).trimEnd()}…` : cleaned;
  return sentenceCase(shortened);
}

export function canonicalizeProcessStepLabel(params: {
  title?: string;
  body?: string;
  fallback?: string;
  index?: number;
}): string {
  const sources = [params.title, params.body, params.fallback].filter(Boolean) as string[];
  for (const source of sources) {
    const match = inferStepFamily(source);
    if (match) return match.label;
  }
  const fallback = params.title || params.fallback || params.body || `Schritt ${(params.index ?? 0) + 1}`;
  return cleanFallbackLabel(fallback);
}

export function stepSemanticKey(label: string): string {
  const family = inferStepFamily(label);
  if (family) return `family:${family.id}`;
  return normalizeLabel(label);
}

export function labelsLikelySameProcessStep(a: string, b: string): boolean {
  const familyA = inferStepFamily(a);
  const familyB = inferStepFamily(b);
  if (familyA && familyB && familyA.id === familyB.id) return true;

  const normalizedA = normalizeLabel(a);
  const normalizedB = normalizeLabel(b);
  if (normalizedA === normalizedB) return true;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return Math.min(normalizedA.length, normalizedB.length) >= 10;
  }

  const tokensA = tokenizeProcessLabel(a);
  const tokensB = tokenizeProcessLabel(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  if (intersection >= 2 && jaccard >= 0.34) return true;
  if (intersection >= 1 && (setA.size <= 2 || setB.size <= 2) && jaccard >= 0.5) return true;
  return false;
}

export function canonicalizeStepSequence(labels: string[]): string[] {
  const result: string[] = [];
  let lastKey: string | null = null;
  labels.forEach((label, index) => {
    const canonical = canonicalizeProcessStepLabel({ fallback: label, index });
    const key = stepSemanticKey(canonical);
    if (key === lastKey) return;
    result.push(canonical);
    lastKey = key;
  });
  return result;
}
