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
      /\bfall anlegen\b/i,
      /\beingang erfassen\b/i,
      /\berstkontakt\b/i,
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
      /\bhistorie\b/i,
      /\bkundendaten\b/i,
      /\bproduktkontext\b/i,
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
      /\bvollst[aä]ndig(?:keit)? pr[üu]fen\b/i,
      /\bfehlende information(?:en)? anfordern\b/i,
      /\bklassifizier/i,
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
      /\bursache bewert/i,
      /\bpr[üu]fschritt\b/i,
      /\banalyse\b/i,
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
      /\brecherch/i,
      /\bvergleichsfall\b/i,
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
      /\bkunde informieren\b/i,
      /\br[üu]ckmeldung an den kunden\b/i,
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
      /\bma[ßs]nahme vorbereiten\b/i,
      /\bersatzteil\b/i,
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
      /\bentscheidung einholen\b/i,
      /\bfreigabe einholen\b/i,
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
      /\bversand\b/i,
      /\bumsetzen\b/i,
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
      /\bcrm dokumentieren\b/i,
      /\babschlussmail\b/i,
      /\babschluss\b/i,
    ],
  },
  {
    id: 'service_ticket_intake',
    label: 'Störung aufnehmen und Ticket anlegen',
    patterns: [
      /\bticket\b/i,
      /\bst[öo]rung\b.*\bmeld/i,
      /\bst[öo]rung auf\b/i,
      /\bfall anlegen\b/i,
      /\bdispatcher\b.*\banleg/i,
    ],
  },
  {
    id: 'service_triage',
    label: 'SLA und Einsatz priorisieren',
    patterns: [
      /\bsla\b/i,
      /\bpriorisier/i,
      /\btriage\b/i,
      /\beinsatz\b.*\bplan/i,
      /\bzeitfenster\b/i,
    ],
  },
  {
    id: 'service_diagnosis',
    label: 'Diagnose und Ursachenklärung durchführen',
    patterns: [
      /\bdiagnose\b/i,
      /\bmonitoring\b/i,
      /\bleitstand\b/i,
      /\bremote\b.*\bdiagnose\b/i,
      /\bkonfigurationsproblem\b/i,
      /\bursache\b/i,
    ],
  },
  {
    id: 'service_execution',
    label: 'Störung beheben und Betrieb stabilisieren',
    patterns: [
      /\bvor ort\b/i,
      /\btechniker\b/i,
      /\bbeheb/i,
      /\bwiederinbetriebnahme\b/i,
      /\bkorrektur ein\b/i,
      /\bremote-unterst[üu]tzung\b/i,
    ],
  },
  {
    id: 'service_documentation',
    label: 'Servicefall dokumentieren und Wissen aktualisieren',
    patterns: [
      /\bservicebericht\b/i,
      /\bwissensbasis\b/i,
      /\bticket\b.*\baktual/i,
      /\bdokumentiert die ursache\b/i,
      /\babschlussdokumentation\b/i,
    ],
  },
  {
    id: 'return_intake',
    label: 'Retourenfall aufnehmen und Referenz prüfen',
    patterns: [
      /\bretoure\b/i,
      /\bruecksendung\b|\brücksendung\b/i,
      /\brma\b/i,
      /\bretourenfall\b/i,
      /\bretoure anmelden\b/i,
      /\bersatz verlangen\b/i,
    ],
  },
  {
    id: 'warranty_check',
    label: 'Garantiegrundlage und Prüfbedarf klären',
    patterns: [
      /\bgarantie\b/i,
      /\bkulanz\b/i,
      /\bgarantiegrundlage\b/i,
      /\bvertrags?-?bedingungen\b/i,
      /\bpruefbedarf\b|\bprüfbedarf\b/i,
      /\bgarantiebedingungen\b/i,
    ],
  },
  {
    id: 'return_decision',
    label: 'Rücksendung, Gutschrift oder Ersatz abstimmen',
    patterns: [
      /\bgutschrift\b/i,
      /\baustausch\b/i,
      /\bersatzlieferung\b/i,
      /\bretourenabwicklung\b/i,
      /\bwareneingang\b/i,
      /\bentscheid(?:ung|en)\b.*\bzwischen\b/i,
      /\bfreigabe\b.*\bersatz\b/i,
    ],
  },
  {
    id: 'return_execution',
    label: 'Retourenabwicklung auslösen und Beteiligte informieren',
    patterns: [
      /\bversandlabel\b/i,
      /\bruecksendung\b.*\bveranlass/i,
      /\brücksendung\b.*\bveranlass/i,
      /\bersatz\b.*\bausloes/i,
      /\bersatz\b.*\bauslös/i,
      /\bkunden\b.*\binformier/i,
      /\bdokumentiert die entscheidung\b/i,
    ],
  },
  {
    id: 'procurement_request',
    label: 'Bedarf aufnehmen und Anfrage anlegen',
    patterns: [
      /\bbedarf\b/i,
      /\banfrage\b/i,
      /\bbeschaff/i,
      /\banforderung\b/i,
      /\bbanfrage anlegen\b/i,
      /\bbestellanforderung\b/i,
      /\brequisition\b/i,
    ],
  },
  {
    id: 'procurement_spec_check',
    label: 'Spezifikation, Budget und Pflichtangaben prüfen',
    patterns: [
      /\bspezifikation\b/i,
      /\bbudget\b/i,
      /\bpflichtangaben\b/i,
      /\bkostenstelle\b/i,
      /\bbedarfsdaten\b/i,
      /\bvollst[aä]ndig\b/i,
      /\bangebotsdaten\b/i,
    ],
  },
  {
    id: 'procurement_supplier_alignment',
    label: 'Lieferanten und Angebote abstimmen',
    patterns: [
      /\blieferant\b/i,
      /\bangebot\b/i,
      /\bvergleichsangebot\b/i,
      /\bfreitextangebot\b/i,
      /\bverhandl/i,
      /\bangebotspr[üu]fung\b/i,
    ],
  },
  {
    id: 'procurement_approval',
    label: 'Einkaufs- und Budgetfreigabe einholen',
    patterns: [
      /\bfreigabe\b/i,
      /\bgenehmig/i,
      /\bbudgetfreigabe\b/i,
      /\bcontrolling\b/i,
      /\bzeichnungsregel\b/i,
      /\bmanager\b.*\bfreig/i,
    ],
  },
  {
    id: 'procurement_order',
    label: 'Bestellung auslösen und bestätigen',
    patterns: [
      /\bbestellung\b/i,
      /\bpo\b/i,
      /\bbestell/i,
      /\bbest[aä]tigung\b/i,
      /\bauftrag ausl[öo]sen\b/i,
    ],
  },
  {
    id: 'procurement_receipt',
    label: 'Wareneingang, Rechnung und Abschluss klären',
    patterns: [
      /\bwareneingang\b/i,
      /\brechnung\b/i,
      /\brechnungspr[üu]fung\b/i,
      /\bbuchhaltung\b/i,
      /\babschluss\b/i,
      /\bleistung best[aä]tigen\b/i,
    ],
  },
  {
    id: 'onboarding_intake',
    label: 'Eintritt, Stammdaten und Starttermin erfassen',
    patterns: [
      /\bonboarding\b/i,
      /\beintritt\b/i,
      /\bstammdaten\b/i,
      /\bstarttermin\b/i,
      /\bnew hire\b/i,
      /\bvertrag\b/i,
      /\bpersonalnummer\b/i,
    ],
  },
  {
    id: 'onboarding_access',
    label: 'Zugänge, Rollen und Equipment anstoßen',
    patterns: [
      /\bzug[aä]nge\b/i,
      /\baccount\b/i,
      /\biam\b/i,
      /\bactive directory\b/i,
      /\bequipment\b/i,
      /\bnotebook\b/i,
      /\brollenprofil\b/i,
    ],
  },
  {
    id: 'onboarding_approval',
    label: 'Freigaben und Verantwortlichkeiten klären',
    patterns: [
      /\bfreigabe\b/i,
      /\bf[üu]hrungskraft\b/i,
      /\bverantwortlich/i,
      /\bfachbereich\b/i,
      /\bdatenschutz\b/i,
      /\bberechtigung\b/i,
    ],
  },
  {
    id: 'onboarding_enablement',
    label: 'Arbeitsplatz, Einweisung und Start vorbereiten',
    patterns: [
      /\barbeitsplatz\b/i,
      /\beinweisung\b/i,
      /\bschulung\b/i,
      /\bwillkommens\b/i,
      /\bstart vorbereiten\b/i,
      /\bsetup\b/i,
    ],
  },
  {
    id: 'onboarding_confirmation',
    label: 'Start bestätigen und Nacharbeiten dokumentieren',
    patterns: [
      /\bstart best[aä]tigen\b/i,
      /\bnacharbeit\b/i,
      /\bdokumentier/i,
      /\bcheckliste\b/i,
      /\babschluss\b/i,
      /\buebergabe\b|\bübergabe\b/i,
    ],
  },

  {
    id: 'billing_intake',
    label: 'Rechnungs- oder Klärfall aufnehmen',
    patterns: [
      /\brechnungskl[aä]r/i,
      /\bkl[aä]rfall\b/i,
      /\brechnungsdifferenz\b/i,
      /\bzahlung wird vorl[aä]ufig gesperrt\b/i,
      /\bbeanstandet\b/i,
      /\bpositionsabweichung\b/i,
    ],
  },
  {
    id: 'billing_validation',
    label: 'Rechnung, Bestellung und Belege prüfen',
    patterns: [
      /\bbestellbezug\b/i,
      /\blieferschein\b/i,
      /\brechnungsworkflow\b/i,
      /\bmenge\b/i,
      /\bpreis\b/i,
      /\bbeleg\b/i,
      /\bwareneingang\b/i,
    ],
  },
  {
    id: 'billing_approval',
    label: 'Gutschrift oder Zahlungsfreigabe abstimmen',
    patterns: [
      /\bgutschrift\b/i,
      /\bzahlungsfreigabe\b/i,
      /\bzahlungssperre\b/i,
      /\bfreigabe\b/i,
      /\bdifferenz abstimmen\b/i,
    ],
  },
  {
    id: 'billing_execution',
    label: 'Korrektur auslösen und Beteiligte informieren',
    patterns: [
      /\bkorr(?:ektur|igieren)\b/i,
      /\bausl[öo]sen\b/i,
      /\binformiert kunde und buchhaltung\b/i,
      /\bzah?lungs?- oder gutschriftl[öo]sung\b/i,
    ],
  },
  {
    id: 'billing_documentation',
    label: 'Klärung dokumentieren und nachhalten',
    patterns: [
      /\bdokumentiert die zahlungskl[aä]rung\b/i,
      /\bnachhalten\b/i,
      /\babschluss\b/i,
      /\bstatus\b/i,
    ],
  },
  {
    id: 'masterdata_intake',
    label: 'Änderungsantrag und Stammdatensatz aufnehmen',
    patterns: [
      /\b[aä]nderungsantrag\b/i,
      /\bstammdaten\b/i,
      /\bstammdatensatz\b/i,
      /\bdebitorenstammdaten\b/i,
      /\bkontaktdaten\b/i,
      /\brechnungsadresse\b/i,
      /\bstammdatensatz aufnehmen\b/i,
    ],
  },
  {
    id: 'masterdata_validation',
    label: 'Pflichtfelder, Nachweise und Dubletten prüfen',
    patterns: [
      /\bpflichtfelder\b/i,
      /\bnachweise\b/i,
      /\bdublette\b/i,
      /\bmdm\b/i,
      /\bsap-satz\b/i,
      /\bbankdaten[aä]nderung\b/i,
    ],
  },
  {
    id: 'masterdata_approval',
    label: 'Freigabe und Compliance klären',
    patterns: [
      /\bcompliance\b/i,
      /\bfreigabe\b/i,
      /\bausnahmefreigabe\b/i,
      /\bstammdatenverantwortung\b/i,
    ],
  },
  {
    id: 'masterdata_execution',
    label: 'Stammdaten in Systemen aktualisieren',
    patterns: [
      /\bpflegt die [aä]nderung\b/i,
      /\baktualisieren die systeme\b/i,
      /\berp\b/i,
      /\bworkflow-ticket\b/i,
      /\bkonflikte zwischen erp und mdm\b/i,
    ],
  },
  {
    id: 'masterdata_confirmation',
    label: 'Nachlauf bestätigen und offene Punkte dokumentieren',
    patterns: [
      /\bnachlauf\b/i,
      /\boffen gebliebene nacharbeiten\b/i,
      /\baktualisierten stand\b/i,
      /\bbest[aä]tigt\b/i,
      /\breview\b/i,
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
